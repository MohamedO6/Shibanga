import { newGame, checkpoint, SAVE_KEY, stageOf, objective, targetOf, nearby, actionLabel, pulse, switchEra, interact, tick, routeTo, canStand, OBJECTS } from "./game-core.js?v=10.0";
import { createGameRenderer, drawEcho } from "./game-renderer.js?v=10.0";
import { createJourneyAudio } from "./journey-audio.js?v=10.0";
import { observationFrames } from "./learn-content.js?v=10.0";
import { icon } from "./icons.js?v=10.0";
import { selectPair } from './investigation-core.js?v=10.0';

const esc=(s)=>String(s ?? "").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clock=(n)=>`${Math.floor(n/60)}:${String(Math.floor(n)%60).padStart(2,"0")}`;

export function initDeltaGame({ root, getData, onExplore, onJourney, onInvestigate, reducedMotion=false }) {
  let raw, sound=true;
  try {raw=localStorage.getItem(SAVE_KEY);const prefs=JSON.parse(raw);if(typeof prefs?.sound==="boolean")sound=prefs.sound;} catch { /* optional local checkpoint */ }
  let s=newGame(raw), active=false, mode="title", paused=false, frame=0, last=0, uiAt=0, saveAt=0, audioStatus="idle", exiting=false, realIndex=-1, persisted=!!raw;
  const encode=()=>JSON.stringify({...JSON.parse(checkpoint(s)),sound});
  let lastSaved=encode();
  const keys=new Set();
  root.className="delta-game";root.lang="en";
  root.innerHTML=`<header class="dg-header"><button data-game="title" class="dg-brand" aria-label="Delta Dispatch home"><span class="dg-brand-mark">◈</span><span>fringe <small>FIELD ADVENTURES</small></span></button><div><button data-game="sound" class="dg-quiet"></button><button data-game="exit" class="dg-quiet">Explore the map ${icon("arrowRight",{size:14})}</button></div></header>
    <section class="dg-title-screen"><img class="dg-keyart" data-src="assets/game/delta-dispatch.webp" alt="Original pixel illustration of a Nile Delta research station, a field scout and Echo the robot" width="1672" height="941"><div class="dg-title-shade"></div><div class="dg-title-copy"><p class="dg-kicker">A FRINGE FIELD ADVENTURE</p><h1 tabindex="-1">Delta<br><em>Dispatch.</em></h1><p>A lost signal. A changing field.<br>A small adventure with a bigger question.</p><div class="dg-title-buttons"><button class="dg-primary" data-game="start">Start expedition ${icon("arrowRight",{size:18})}</button><button class="dg-secondary" data-game="restart" hidden>New expedition</button></div><div class="dg-title-meta"><span>EXPLORE</span><i></i><span>COMPARE</span><i></i><span>CHECK THE GROUND</span></div><p class="dg-title-foot">A 5–8 minute pixel adventure · Keyboard & touch · No timer</p><button class="dg-text" data-game="journey">Take the cinematic journey instead ↗</button></div><div class="dg-intro-guide"><canvas width="64" height="64" aria-hidden="true" class="dg-echo-portrait"></canvas><div><span>ECHO / YOUR RADAR SCOUT</span><p>“I’ll bring the echoes.<br>You bring the curiosity.”</p></div></div><div class="dg-fiction">FICTIONAL TRAINING WORLD · REAL SCIENTIFIC HABITS</div></section>
    <section class="dg-play" hidden><div class="dg-mission-heading"><div><p class="dg-kicker" id="dg-chapter"></p><h1 id="dg-objective"></h1></div><button class="dg-secondary dg-pause" data-game="pause">${icon("pause",{size:14})} Pause</button></div>
      <div class="dg-layout"><div class="dg-world-column"><div class="dg-world-frame"><canvas class="dg-world" width="384" height="240" tabindex="0" aria-label="Playable pixel world. Move with arrow keys or W A S D. Space scans, E interacts, T switches survey date."></canvas><div class="dg-world-top"><span class="dg-world-label">NILE DELTA / TRAINING WORLD</span><span class="dg-era"></span></div><div class="dg-world-bottom"><span class="dg-location"></span><span class="dg-compass"></span></div><div class="dg-prompt" hidden></div><div class="dg-pulse-flash" hidden></div></div>
      <div class="dg-controls"><div class="dg-dpad" aria-label="Movement controls"><button data-move="up" aria-label="Move north">▲</button><button data-move="left" aria-label="Move west">◀</button><button data-move="down" aria-label="Move south">▼</button><button data-move="right" aria-label="Move east">▶</button></div><div class="dg-action-buttons"><button data-game="scan" title="Space"><span>◎</span> Radar pulse <kbd>Space</kbd></button><button data-game="time" title="T"><span>◷</span> Survey <b class="dg-era-short">B</b> <kbd>T</kbd></button><button data-game="interact" class="dg-primary" title="E"><span class="dg-action-label">Interact</span> <kbd>E</kbd></button></div></div><p class="dg-keyboard-help"><span>WASD / arrows to move · Tap ground to walk · E to interact</span><button class="dg-text" data-game="help">Controls & accessibility</button></p></div>
      <aside class="dg-sidebar"><div class="dg-guide-card"><div class="dg-guide-head"><canvas width="64" height="64" aria-hidden="true" class="dg-echo-portrait"></canvas><div><span>ECHO</span><small>YOUR RADAR SCOUT</small></div><i></i></div><p class="dg-guide-message" aria-live="polite"></p><div class="dg-guide-actions"><button data-game="follow">Follow Echo ↗</button><button data-game="hint">Hint</button></div></div><div class="dg-field-pack"><div class="dg-pack-head"><span>FIELD PACK</span><button data-game="journal">Open journal ${icon("book",{size:13})}</button></div><ol class="dg-checklist"><li data-clue="relay"><i></i><div>Radar echo<small>Find the cloud-covered relay</small></div><span>01</span></li><li data-clue="dates"><i></i><div>Paired dates<small>The same place, twice</small></div><span>02</span></li><li data-clue="gauge"><i></i><div>Field check<small>Ground context for the echo</small></div><span>03</span></li></ol><div class="dg-mini-row"><canvas class="dg-mini" width="120" height="84" aria-label="Mini-map: you are cream, the objective is gold."></canvas><div><span class="dg-playtime">0:00</span><small>EXPLORATION TIME</small><span class="dg-note-count">0 / 3 field notes</span></div></div></div><p class="dg-science-label">The island, dates and readings in this game are fictional. Actual NISAR imagery and sources are in the explorer.</p></aside></div>
    <div class="dg-live" role="status" aria-live="polite"></div></section>
    <section class="dg-complete" hidden><p class="dg-kicker">DELTA DISPATCH / MISSION COMPLETE</p><canvas width="64" height="64" aria-hidden="true" class="dg-echo-portrait"></canvas><h1>Clues collected.<br><em>Context matters.</em></h1><p>You restored the relay, paired two dates and checked the field. An echo became a supported local observation in this fictional case.</p><div class="dg-complete-clues"><div><span>01</span><b>A radar echo</b><p>Radar can observe through cloud cover.</p></div><div><span>02</span><b>Two survey dates</b><p>One picture cannot establish a change.</p></div><div><span>03</span><b>A field check</b><p>Independent context tests an interpretation.</p></div></div><div class="dg-next-expedition"><div><span class="dg-kicker">YOUR NEXT EXPEDITION IS REAL</span><h2>Meet the actual Nile Delta.</h2><p class="dg-real-dates"></p><button class="dg-primary" data-game="real">Open real NISAR observations →</button></div><figure class="dg-real-observation"><figcaption><span>ACTUAL NISAR / HH + HV PREVIEW</span><time></time></figcaption><div><img alt=""><p class="dg-real-missing" role="status" hidden>Preview unavailable. Continue to the explorer to check the available data.</p></div><input class="dg-real-timeline" type="range" min="0" max="0" value="0" aria-label="Real NISAR acquisition date"><p>NASA/JPL-Caltech &amp; ISRO · ASF DAAC · Provisional GCOV</p></figure></div><p class="dg-complete-stats"></p><div class="dg-complete-actions"><button data-game="journal" class="dg-secondary">Read field journal</button><button data-game="restart" class="dg-secondary">Play again</button><button data-game="journey" class="dg-text">Cinematic journey ↗</button></div></section>
    <dialog class="dg-dialog" aria-label="Delta Dispatch field guide"><div class="dg-dialog-content"></div></dialog>`;
  const $=(q)=>root.querySelector(q), dialog=$(".dg-dialog"), canvas=$(".dg-world");
  const renderer=createGameRenderer(canvas,$(".dg-mini"),reducedMotion);
  root.querySelectorAll(".dg-echo-portrait").forEach((c)=>drawEcho(c.getContext("2d"),32,33,0,2));
  const audio=createJourneyAudio({enabled:sound,onStatus:({status})=>{audioStatus=status;updateSound();}});
  function save() {
    const value=encode();
    // An unchanged inactive tab must not overwrite another tab's new checkpoint on pagehide.
    if(value===lastSaved)return;
    try {localStorage.setItem(SAVE_KEY,value);lastSaved=value;persisted=true;} catch {persisted=false;}
  }
  function updateSound() {
    const b=$('[data-game="sound"]');if(!b)return;
    b.setAttribute("aria-pressed",String(sound && audioStatus!=="unavailable"));
    b.setAttribute("aria-label",audioStatus==="unavailable"?"Game sound unavailable":sound?"Mute game sound":"Enable game sound");
    b.innerHTML=`${icon(sound && audioStatus!=="unavailable"?"volume":"volumeOff",{size:15})}<span>${audioStatus==="unavailable"?"Sound unavailable":sound?"Sound on":"Sound off"}</span>`;
    root.dataset.audio=audioStatus;
  }
  function message(text) {$(".dg-guide-message").textContent=text;}
  function announce(text) {$(".dg-live").textContent=text;}
  function setMode(next) {
    mode=next;root.dataset.mode=mode;root.parentElement.scrollTop=0;
    $(".dg-title-screen").hidden=mode!=="title";$(".dg-play").hidden=mode!=="play";$(".dg-complete").hidden=mode!=="complete";
    if(mode!=="play") {cancelAnimationFrame(frame);frame=0;void audio.setActive(false);}
  }
  function updateTitle() {
    const started=s.seconds>1 || s.relay || s.found;
    $('[data-game="start"]').innerHTML=`${s.delivered?"View completed expedition":started?"Continue expedition":"Start expedition"} ${icon("arrowRight",{size:18})}`;
    $('.dg-title-buttons [data-game="restart"]').hidden=!started;
  }
  function syncUI() {
    const goal=objective(s),stage=stageOf(s),o=nearby(s),target=targetOf(s);
    root.dataset.stage=stage;
    $("#dg-chapter").textContent=goal.chapter;$("#dg-objective").textContent=goal.title;
    $(".dg-era").textContent=`SURVEY ${s.era} / ${s.era==="A"?"BEFORE":"AFTER"}`;$(".dg-era-short").textContent=s.era;
    $('[data-game="time"]').disabled=!s.relay;
    $(".dg-action-label").textContent=actionLabel(s);
    $(".dg-prompt").hidden=!o;$(".dg-prompt").textContent=o?`E · ${actionLabel(s)}`:"";
    $(".dg-location").textContent=`SCOUT ${Math.floor(s.x/16)+1} : ${Math.floor(s.y/16)+1}`;
    const dx=target.x-s.x,dy=target.y-s.y;
    $(".dg-compass").textContent=Math.hypot(dx,dy)<27?"OBJECTIVE NEARBY":`${Math.abs(dx)>Math.abs(dy)?dx<0?"← WEST":"EAST →":dy<0?"↑ NORTH":"SOUTH ↓"} · ${Math.round(Math.hypot(dx,dy)/16)} TILES`;
    for(const [clue,done] of [["relay",s.relay],["dates",s.captures.length===2],["gauge",s.gauge]]) {
      const el=$(`[data-clue="${clue}"]`);el.classList.toggle("is-collected",done);el.querySelector("i").textContent=done?"✓":"";
    }
    $(".dg-playtime").textContent=clock(s.seconds);$(".dg-note-count").textContent=`${s.notes.length} / 3 field notes`;
    $('[data-game="follow"]').textContent=s.nav.length?"Stop following ◼":"Follow Echo ↗";
  }
  function loop(now) {
    frame=0;if(!active || mode!=="play" || paused)return;
    const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
    const input={x:(keys.has("right")?1:0)-(keys.has("left")?1:0),y:(keys.has("down")?1:0)-(keys.has("up")?1:0)};
    const navigating=s.nav.length;
    tick(s,dt,input);renderer.draw(s,now/1000);
    if(navigating && !s.nav.length && !input.x && !input.y) {
      const target=targetOf(s),near=Math.hypot(s.x-target.x,s.y-target.y)<27;
      const arrival=near?({relay:s.found?"Relay reached. Interact to reconnect it.":"Cloud bank reached. Send a radar pulse. I’ll watch for the returning echo.",compare:"Time relay reached. Capture this survey, switch dates and capture the other visit.",gauge:"Gauge reached. Interact to collect the field record.",return:"Field station reached. Deliver your evidence."})[stageOf(s)]:"Route complete. You can take over.";
      if(arrival){message(arrival);announce(arrival);}
    }
    if(now-uiAt>100) {syncUI();uiAt=now;}
    if(now-saveAt>3000) {save();saveAt=now;}
    frame=requestAnimationFrame(loop);
  }
  function run() {if(!frame && active && mode==="play" && !paused){last=0;frame=requestAnimationFrame(loop);}}
  function start() {
    if(s.delivered) {complete();return;}
    setMode("play");paused=false;resize();syncUI();
    message(s.relay?objective(s).text:"I’m Echo. A relay has gone quiet under the northern clouds. Let’s find it! Move with WASD or arrows. Use a radar pulse when you’re close.");
    void audio.begin();run();canvas.focus({preventScroll:true});save();
  }
  function result(event) {
    if(!event || event.type==="quiet")return;
    message(event.text);announce(event.text);
    if(event.type==="milestone" || event.type==="discovery" || event.fresh)audio.ping(.9);
    else audio.ping(.3);
    if(event.type==="complete")complete();
    syncUI();save();
    if(s.captures.length===2 && !s.archiveSeen && !s.delivered) {s.archiveSeen=true;save();archive();}
  }
  function complete() {
    setMode("complete");s.nav=[];save();
    const frames=observationFrames(getData());
    $(".dg-real-dates").textContent=frames.length?`${frames.length} actual provisional HH/HV previews, ${frames[0].date} to ${frames.at(-1).date}. Real colours are clues, not a verified flood classification.`:"Explore the available data, acquisition dates and sources. Real preview availability depends on the bundled observation index.";
    updateRealObservation();
    $(".dg-complete-stats").textContent=`${clock(s.seconds)} of exploration · ${s.notes.length}/3 optional field notes · ${persisted?"Checkpoint saved":"Progress lasts this session: storage unavailable"}`;
    $(".dg-complete h1").tabIndex=-1;$(".dg-complete h1").focus({preventScroll:true});
    root.scrollIntoView({block:"start",behavior:"instant"});
  }
  function updateRealObservation() {
    const frames=observationFrames(getData()), image=$(".dg-real-observation img"), missing=$(".dg-real-missing"), range=$(".dg-real-timeline");
    if(realIndex<0 || realIndex>=frames.length)realIndex=frames.length-1;
    range.max=String(Math.max(0,frames.length-1));range.value=String(Math.max(0,realIndex));range.disabled=frames.length<2;
    if(!frames.length) {image.hidden=true;missing.hidden=false;$(".dg-real-observation time").textContent="Unavailable";return;}
    const f=frames[realIndex], src=`data/${f.file}`;
    if(image.getAttribute("src")!==src) {image.hidden=false;missing.hidden=true;image.src=src;}
    image.alt=`Real qualitative NISAR HH/HV preview of the Nile Delta, ${f.date}`;
    $(".dg-real-observation time").textContent=f.date;range.setAttribute("aria-valuetext",f.date);
  }
  $(".dg-real-observation img").addEventListener("error",()=>{$(".dg-real-observation img").hidden=true;$(".dg-real-missing").hidden=false;});
  $(".dg-real-observation img").addEventListener("load",()=>{$(".dg-real-observation img").hidden=false;$(".dg-real-missing").hidden=true;});
  $(".dg-real-timeline").addEventListener("input",()=>{realIndex=Number($(".dg-real-timeline").value);updateRealObservation();});
  function modal(html) {
    paused=true;keys.clear();cancelAnimationFrame(frame);frame=0;void audio.setActive(false);
    $(".dg-dialog-content").innerHTML=html;
    if(!dialog.open)dialog.showModal();
  }
  function archive() {
    const frames=observationFrames(getData()),pair=selectPair(frames,s.archivePair?.a,s.archivePair?.b);
    modal(`<p class="dg-kicker">ECHO / ARCHIVE UPLINK</p><h2>Beyond our pixel island.</h2><p>“We paired our fictional surveys. Here are actual radar visits to the Nile Delta. Keep them in a separate pocket of your journal.”</p>${pair?`<div class="dg-archive"><div class="dg-archive-selects"><label>Earlier acquisition<select data-archive="a">${frames.map((f)=>`<option ${f.date===pair.earlier.date?'selected':''}>${f.date}</option>`).join('')}</select></label><label>Later acquisition<select data-archive="b">${frames.map((f)=>`<option ${f.date===pair.later.date?'selected':''}>${f.date}</option>`).join('')}</select></label></div><div class="dg-archive-images"><figure><img data-archive-img="a" alt=""><figcaption></figcaption></figure><figure><img data-archive-img="b" alt=""><figcaption></figcaption></figure></div><p class="dg-archive-source">ACTUAL NISAR · HH/HV QUALITATIVE PREVIEWS<br>NASA/JPL-Caltech & ISRO / ASF DAAC · Provisional</p><p class="dg-archive-description"></p><button class="dg-primary" data-game="attach-archive">Keep this real pair in my journal →</button></div>`:'<p>The actual archive is unavailable. Continue the mission; no data will be invented.</p>'}<p class="dg-modal-note">The bridge and gauge belong to the fictional game. They cannot validate these real images. Colour differences need matching-date independent checks.</p><button class="dg-secondary" data-game="resume">${pair?'Continue without attaching':'Continue expedition'} →</button>`);
    if(pair)updateArchive();
  }
  function updateArchive() {
    const pair=selectPair(observationFrames(getData()),$('[data-archive="a"]').value,$('[data-archive="b"]').value);if(!pair)return;
    $('[data-archive="a"]').value=pair.earlier.date;$('[data-archive="b"]').value=pair.later.date;
    for(const [key,f] of [['a',pair.earlier],['b',pair.later]]) {const img=$(`[data-archive-img="${key}"]`);img.src=`data/${f.file}`;img.alt=`Actual NISAR HH/HV qualitative preview, ${f.date}`;img.nextElementSibling.textContent=f.date;img.onerror=()=>{img.hidden=true;img.nextElementSibling.textContent=`${f.date} · Preview unavailable`;};img.onload=()=>{img.hidden=false;};}
    $('.dg-archive-description').textContent=`${pair.days} days apart · Same displayed footprint · Colours alone do not identify the cause of a change.`;
  }
  root.addEventListener('change',(ev)=>{if(ev.target.matches('[data-archive]'))updateArchive();});
  function closeModal() {dialog.close();}
  dialog.addEventListener("close",()=>{paused=false;void audio.setActive(active && mode==="play");run();if(active && mode==="play")canvas.focus({preventScroll:true});});
  function pause() {if(mode!=="play")return;modal(`<p class="dg-kicker">TAKE YOUR TIME</p><h2>Expedition paused.</h2><p>Your field pack stays with you. Nothing moves while you’re away.</p><button class="dg-primary" data-game="resume">Resume expedition →</button><button class="dg-secondary" data-game="help">Controls & accessibility</button><button class="dg-text" data-game="title">Return to title</button>`);save();}
  function help() {modal(`<p class="dg-kicker">YOUR FIELD CONTROLS</p><h2>A little help from Echo.</h2><dl><dt>Move</dt><dd>WASD / arrow keys, touch direction buttons, or tap a walkable place in the world.</dd><dt>Radar pulse</dt><dd>Space or the Radar pulse button. Scan near the northern clouds to find the lost relay.</dd><dt>Interact</dt><dd>E or the action button, close to a relay, gauge, station or field note.</dd><dt>Switch survey</dt><dd>T or Survey A/B, after restoring the first relay. Capture both dates at the time relay.</dd><dt>Follow Echo</dt><dd>Optional navigation assistance. Echo walks you to the next objective using the same paths; you still collect the evidence. Manual movement cancels assistance.</dd><dt>Take a break</dt><dd>Escape pauses. Sound is optional. There is no timer, damage or failure penalty.</dd></dl><p class="dg-modal-note">The story, island and readings are fictional. The actual NISAR explorer is a separate, labelled data view. Reduced-motion preferences limit decorative motion.</p><button class="dg-primary" data-game="resume">${mode==="play"?"Back to expedition":"Close controls"} →</button>`);}
  function journal() {
    modal(`<p class="dg-kicker">ECHO’S FIELD JOURNAL</p><h2>Keep the evidence together.</h2><div class="dg-journal-clues"><p><b>${s.relay?"✓":"○"} Radar echo</b><span>A fictional radar relay reconnected through cloud cover.</span></p><p><b>${s.captures.length===2?"✓":"○"} Paired dates · ${s.captures.length}/2</b><span>Surveys A and B compare the same place. They are game epochs, not NISAR acquisition dates.</span></p><p><b>${s.gauge?"✓":"○"} Field check</b><span>${s.gauge?"The fictional gauge supports a local rise in water at the sample plot; it does not validate the real Delta imagery.":"Collect independent context at the field gauge beyond the north bridge."}</span></p></div><div class="dg-journal-archive"><h3>Actual observation pocket</h3><p>${s.archivePair ? esc(s.archivePair.a)+" → "+esc(s.archivePair.b)+" · Actual NISAR HH/HV previews. Interpretation unverified." : "No actual pair attached. The expedition readings stay fictional."}</p><button class="dg-secondary" data-game="archive">Open archive uplink</button>${s.archivePair ? `<button class="dg-secondary" data-game="investigate">Compare this pair in Inspect ↗</button>` : ""}</div><h3>Field notes · ${s.notes.length}/3</h3>${s.notes.length?s.notes.map((id)=>`<p class="dg-journal-note">${esc(OBJECTS.find((o)=>o.id===id).note)}</p>`).join(""):"<p>Look for paper field notes along the paths. They are optional discoveries.</p>"}<p class="dg-modal-note">Fictional training case. No game reading is exported as a real measurement. Open the explorer for actual product IDs, dates and observation reports.</p><button class="dg-primary" data-game="resume">Close journal →</button>`);
  }
  async function leave(real=false) {
    if(exiting)return;exiting=true;keys.clear();save();if(dialog.open)dialog.close();paused=true;cancelAnimationFrame(frame);frame=0;void audio.setActive(false);
    try {await onExplore({guided:real,observationDate:real?observationFrames(getData())[realIndex]?.date:undefined});}
    finally {exiting=false;paused=false;}
  }
  function title() {if(dialog.open)dialog.close();keys.clear();setMode("title");updateTitle();save();$(".dg-title-copy h1").focus({preventScroll:true});}
  function restart() {
    if(s.seconds>1 || s.relay) modal(`<p class="dg-kicker">NEW FIELD EXPEDITION</p><h2>Start a fresh adventure?</h2><p>This resets this game’s checkpoint and optional field notes on this device. The scientific explorer is unaffected.</p><button class="dg-primary" data-game="confirm-restart">Start fresh expedition →</button><button class="dg-secondary" data-game="resume">Keep my expedition</button>`);
    else {s=newGame();start();}
  }
  root.addEventListener("click",(ev)=>{
    const action=ev.target.closest("[data-game]")?.dataset.game;
    if(!action)return;
    if(action==="sound") {sound=!sound;void audio.setEnabled(sound);updateSound();save();}
    if(action==="start")start();
    if(action==="title")title();
    if(action==="pause")pause();
    if(action==="resume")closeModal();
    if(action==="help")help();
    if(action==="journal")journal();
    if(action==="archive")archive();
    if(action==="attach-archive") {const p=selectPair(observationFrames(getData()),$('[data-archive="a"]').value,$('[data-archive="b"]').value);if(p){s.archivePair={a:p.earlier.date,b:p.later.date};save();closeModal();message("Real acquisition dates saved in your journal. Now check our fictional field gauge beyond the bridge.");}}
    if(action==="investigate") {save();if(dialog.open)dialog.close();onInvestigate?.(s.archivePair||{});}

    if(action==="restart")restart();
    if(action==="confirm-restart") {s=newGame();closeModal();start();}
    if(action==="journey") {save();if(dialog.open)dialog.close();onJourney();}
    if(action==="exit")void leave();
    if(action==="real")void leave(true);
    if(mode!=="play" || paused)return;
    if(action==="scan")result(pulse(s));
    if(action==="time")result(switchEra(s));
    if(action==="interact")result(interact(s));
    if(action==="hint")message(objective(s).text);
    if(action==="follow") {
      if(s.nav.length)s.nav=[];
      else {s.nav=routeTo(s);message(stageOf(s)==="relay"&&!s.found?"Follow me north. Once we’re under the clouds, send a radar pulse. I can guide the route; you make the discovery.":`Follow my light toward ${targetOf(s).name.toLowerCase()}. You can take over at any time.`);}
      syncUI();canvas.focus({preventScroll:true});
      if(window.innerWidth<700)$(".dg-world-frame").scrollIntoView({block:"center",behavior:reducedMotion?"instant":"smooth"});
    }
  });
  const direction={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",w:"up",s:"down",a:"left",d:"right"};
  root.addEventListener("keydown",(ev)=>{
    if(!active || mode!=="play" || ev.ctrlKey || ev.metaKey || ev.altKey || dialog.open)return;
    const key=ev.key.length===1?ev.key.toLowerCase():ev.key;
    if(direction[key]) {ev.preventDefault();keys.add(direction[key]);}
    if(ev.repeat)return;
    if(key==="Escape") {ev.preventDefault();pause();}
    if(key==="e") {ev.preventDefault();result(interact(s));}
    if(key==="t") {ev.preventDefault();result(switchEra(s));}
    if(key===" " && ev.target.tagName!=="BUTTON") {ev.preventDefault();result(pulse(s));}
  });
  window.addEventListener("keyup",(ev)=>{const key=ev.key.length===1?ev.key.toLowerCase():ev.key;keys.delete(direction[key]);});
  for(const b of root.querySelectorAll("[data-move]")) {
    b.addEventListener("pointerdown",(ev)=>{if(mode!=="play" || paused)return;ev.preventDefault();keys.add(b.dataset.move);b.setPointerCapture(ev.pointerId);});
    for(const type of ["pointerup","pointercancel","lostpointercapture"])b.addEventListener(type,()=>keys.delete(b.dataset.move));
  }
  canvas.addEventListener("click",(ev)=>{
    if(mode!=="play" || paused)return;
    const p=renderer.worldPoint(ev.clientX,ev.clientY);
    if(canStand(p.x,p.y,s))s.nav=routeTo(s,p);else message("The canals and buildings block that route. Try a path or a wooden bridge.");
    canvas.focus({preventScroll:true});
  });
  function resize() {const rect=$(".dg-world-frame").getBoundingClientRect();renderer.resize(window.innerWidth<700,rect.width/rect.height);if(mode==="play")renderer.draw(s,performance.now()/1000);}
  window.addEventListener("resize",resize);
  document.addEventListener("visibilitychange",()=>{void audio.setVisible(!document.hidden);if(document.hidden && active && mode==="play" && !dialog.open)pause();});
  window.addEventListener("blur",()=>{keys.clear();});
  window.addEventListener("pagehide",()=>{save();void audio.setActive(false);});
  updateSound();updateTitle();setMode("title");
  return {
    setActive(value) {active=value;keys.clear();if(!value){cancelAnimationFrame(frame);frame=0;save();if(dialog.open)dialog.close();}void audio.setActive(active && mode==="play" && !paused);if(value){const art=$(".dg-keyart");if(art.dataset.src){art.src=art.dataset.src;delete art.dataset.src;}resize();run();}},
    enter() {(mode==="title"?$(".dg-title-copy h1"):mode==="play"?canvas:$(".dg-complete h1")).focus({preventScroll:true});},
    refreshData() {if(mode==="complete")complete();},
  };
}
