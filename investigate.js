import { NOTEBOOK_KEY, METHODS, LIMITS, framesFor, selectPair, validPin, readSelection, shareUrl, readNotebook, makeNote, notesCsv, validationRows, buildBrief, briefHtml, escapeHtml as e } from './investigation-core.js?v=10.0';
import { datasetCounts, comparisonCsv, downloadFile, seriesSpan } from './science.js?v=10.0';

export function initInvestigation({root,getData,onMap}) {
  const initial=readSelection(location.href);
  let frames=[],pair=null,pin=initial.pin,panel=initial.panel,mode='swipe',active=false,blink=0,blinkLater=false,notebook=null,raw=null,persisted=true,audit=null,integrity=null,revision=0;
  try {raw=localStorage.getItem(NOTEBOOK_KEY);} catch {persisted=false;}
  root.className='investigation';
  root.innerHTML=`<header class="iv-head"><div><p class="iv-eyebrow">FRINGE / OBSERVATION DESK</p><h1>Look closer.<br><em>Keep the evidence.</em></h1><p>Compare actual radar visits. Record what you see, separate it from what you infer, and take the sources with you.</p></div><div class="iv-coordinate"><span>01 / NILE DELTA</span><b>31.25° N<br>31.62° E</b><small>Scene centre · Egypt</small></div></header>
    <div class="iv-tabs" role="tablist" aria-label="Investigation workspace"><button role="tab" data-panel="compare">Compare dates</button><button role="tab" data-panel="validation">Validation</button><button role="tab" data-panel="methods">Data & methods</button></div>
    <section class="iv-panel" data-content="compare"><div class="iv-empty" hidden><h2>Observation archive unavailable.</h2><p>Two indexed acquisitions are needed for comparison. You can still explore the map and read the methods. No replacement imagery is generated.</p><button data-iv="map">Explore the map →</button></div><div class="iv-compare-content">
    <div class="iv-toolbar"><span class="iv-chip">ACTUAL NISAR · QUALITATIVE PREVIEW</span><div class="iv-modes" role="group" aria-label="Comparison style"><button data-mode="swipe" aria-pressed="true">Swipe</button><button data-mode="side" aria-pressed="false">Side by side</button><button data-mode="blink" aria-pressed="false">Blink</button></div></div>
    <div class="iv-workspace"><div class="iv-imagery"><div class="iv-date-pair"><label>Earlier visit<select class="iv-date-a" aria-label="Earlier acquisition"></select></label><div class="iv-elapsed"></div><label>Later visit<select class="iv-date-b" aria-label="Later acquisition"></select></label></div>
    <div class="iv-stage" data-mode="swipe"><div class="iv-footprint" role="group" aria-label="Actual NISAR preview comparison"><div class="iv-layer iv-earlier"><img alt="" width="683" height="688"><p class="iv-img-error" hidden>Earlier preview unavailable. Check its source below.</p></div><div class="iv-layer iv-later"><img alt="" width="683" height="688"><p class="iv-img-error" hidden>Later preview unavailable. Check its source below.</p></div><div class="iv-divider" aria-hidden="true"></div><div class="iv-pin" hidden aria-hidden="true">＋</div><button class="iv-pin-target" aria-label="Place inspection pin at image centre. Arrow keys move it; click or tap places it directly."></button><span class="iv-image-tag iv-tag-a"></span><span class="iv-image-tag iv-tag-b"></span></div></div>
    <label class="iv-swipe-label">Reveal later visit <input type="range" min="0" max="100" value="50" class="iv-swipe" aria-label="Reveal later acquisition" aria-valuetext="50 percent"></label><div class="iv-blink-controls" hidden><button data-iv="blink">Start blink</button><button data-iv="flip">Show later visit</button><span>Manual control is always available. 1.2 seconds per frame.</span></div><p class="iv-pin-caption">Tap the image to place a visual inspection pin. This is an image coordinate, not a surveyed location. <button data-iv="clear-pin">Clear pin</button></p>
    <details class="iv-provenance"><summary>Acquisition IDs & alignment</summary><div></div></details><p class="iv-caption">HH / HV · R = HH, G = HV, B = HH · NASA/JPL-Caltech & ISRO / ASF DAAC · Provisional</p>
    <div class="iv-actions"><button data-iv="map">Open later visit on map ↗</button><button data-iv="share">Copy comparison link</button><a class="iv-share-fallback" hidden>Open comparison link</a></div></div>
    <aside class="iv-notebook"><p class="iv-eyebrow">YOUR FIELD NOTEBOOK</p><h2>Observation ≠ explanation.</h2><p>A colour shift is a clue. Give it a location, a date and a testable next step.</p><label>Investigation focus<input class="iv-question" maxlength="240"></label><form class="iv-note-form"><label>What is visible?<textarea name="observation" required maxlength="800" placeholder="Describe the visible pattern, without naming a cause."></textarea></label><label>Possible explanation <span>optional</span><textarea name="hypothesis" maxlength="800" placeholder="What could explain it? What else might?"></textarea></label><label>Independent check needed <span>optional</span><textarea name="nextCheck" maxlength="800" placeholder="A matching-date field record, another sensor, calibrated data…"></textarea></label><button class="iv-primary" type="submit">Save observation +</button></form><small class="iv-storage"></small><div class="iv-notes"></div><div class="iv-export"><h3>Take the evidence with you.</h3><p>The brief includes your notes, actual product IDs, images and limitations. You can print the downloaded HTML to PDF.</p><button data-iv="brief">Download illustrated brief</button><button data-iv="json">Notebook + provenance JSON</button><button data-iv="csv">Notes CSV</button><label class="iv-import">Import notebook JSON<input type="file" accept=".json,application/json" class="iv-import-file"></label></div></aside></div>
    <div class="iv-limit-strip"><b>What these images can tell you</b><p>They support visual comparison of radar echoes. A preview alone cannot establish flood extent, crop health or displacement. <button data-panel="methods">Read the methods →</button></p></div></div></section>
    <section class="iv-panel" data-content="validation" hidden></section><section class="iv-panel" data-content="methods" hidden></section><p class="iv-status" role="status" aria-live="polite"></p>`;
  const $=(q)=>root.querySelector(q),all=(q)=>[...root.querySelectorAll(q)];
  const status=(s)=>{$('.iv-status').textContent=s;};
  function save() {
    try {localStorage.setItem(NOTEBOOK_KEY,JSON.stringify(notebook));persisted=true;} catch {persisted=false;}
    $('.iv-storage').textContent=persisted?'Saved on this device. Export a copy to keep or share it.':'Device storage unavailable. Notes last this session; export a copy before leaving.';
  }
  function syncUrl() {if(active&&pair)history.replaceState(null,'',shareUrl(location.href,pair,pin,panel));}
  function stopBlink() {clearInterval(blink);blink=0;$('.iv-blink-controls [data-iv="blink"]').textContent='Start blink';}
  function showBlink(later) {blinkLater=later;$('.iv-stage').classList.toggle('is-later',later);$('[data-iv="flip"]').textContent=later?'Show earlier visit':'Show later visit';}
  function showPanel(next) {
    panel=['compare','validation','methods'].includes(next)?next:'compare';stopBlink();
    for(const el of all('[data-content]')){el.hidden=el.dataset.content!==panel;el.id=`iv-panel-${el.dataset.content}`;el.setAttribute('role','tabpanel');el.setAttribute('aria-labelledby',`iv-tab-${el.dataset.content}`);}
    for(const b of all('[role="tab"][data-panel]')){b.id=`iv-tab-${b.dataset.panel}`;b.setAttribute('aria-controls',`iv-panel-${b.dataset.panel}`);b.setAttribute('aria-selected',String(b.dataset.panel===panel));b.tabIndex=b.dataset.panel===panel?0:-1;}
    syncUrl();
  }
  function updatePin() {
    const marker=$('.iv-pin');marker.hidden=!pin||mode==='side';
    if(pin){marker.style.left=`${pin.x*100}%`;marker.style.top=`${pin.y*100}%`;}
    $('.iv-pin-target').setAttribute('aria-label',pin?`Inspection pin at ${Math.round(pin.x*100)} percent across, ${Math.round(pin.y*100)} percent down. Arrow keys move it.`:'Place inspection pin at image centre. Arrow keys move it; click or tap places it directly.');syncUrl();
  }
  function setMode(next) {
    stopBlink();mode=next;$('.iv-stage').dataset.mode=mode;
    for(const b of all('button[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
    $('.iv-swipe-label').hidden=mode!=='swipe';$('.iv-blink-controls').hidden=mode!=='blink';
    $('.iv-pin-target').hidden=mode==='side';showBlink(false);updatePin();
  }
  function updatePair(a,b) {
    stopBlink();pair=selectPair(frames,a,b);if(!pair)return;
    integrity=null;revision++;if($('.iv-integrity'))$('.iv-integrity').textContent='Selection changed. Not checked for the current pair.';
    $('.iv-date-a').value=pair.earlier.date;$('.iv-date-b').value=pair.later.date;
    $('.iv-elapsed').innerHTML=`<b>${pair.days}</b><span>DAYS APART</span>`;
    if(active)loadPairImages();
    $('.iv-tag-a').textContent=pair.earlier.date;$('.iv-tag-b').textContent=pair.later.date;
    $('.iv-provenance div').innerHTML=`<p>Track ${pair.track} · descending · ${pair.between} bundled visits between these dates. The images share the displayed footprint; no additional pixel registration is performed here.</p>${[pair.earlier,pair.later].map((f)=>`<p><b>${f.date}</b><br><code>${e(f.granule)}</code><br>Browse-to-map fit RMS: ${Number.isFinite(f.fitRmsPx)?`${f.fitRmsPx.toFixed(2)} px`:'not reported (unknown)'} · <a href="data/${e(f.file)}" target="_blank" rel="noopener">Open bundled preview ↗</a></p>`).join('')}<p>Fit measures browse alignment, not confidence in a change or geophysical accuracy.</p>`;
    renderNotes();syncUrl();
  }
  function loadPairImages() {
    if(!pair)return;
    for(const [key,frame] of [['earlier',pair.earlier],['later',pair.later]]) {
      const layer=$(`.iv-${key}`),img=layer.querySelector('img'),src=`data/${frame.file}`;
      img.alt=`Actual qualitative NISAR HH/HV preview of the Nile Delta, ${frame.date}`;
      if(img.getAttribute('src')!==src){img.hidden=false;layer.querySelector('p').hidden=true;img.src=src;}
    }
  }
  function renderNotes() {
    if(!notebook)return;
    $('.iv-notes').innerHTML=`<h3>${notebook.notes.length} / 20 saved observations</h3>${notebook.notes.map((n)=>`<article><small>${n.a} → ${n.b} · Unverified</small><p>${e(n.observation)}</p>${n.hypothesis?`<p><b>Hypothesis:</b> ${e(n.hypothesis)}</p>`:''}${n.nextCheck?`<p><b>Next check:</b> ${e(n.nextCheck)}</p>`:''}<button data-note="${e(n.id)}">View pair${n.pin?' & pin':''}</button><button data-remove="${e(n.id)}" aria-label="Delete saved observation">Delete</button></article>`).join('')}`;
    $('.iv-note-form button').disabled=notebook.notes.length>=20;
  }
  function validation() {
    const {stack,summary:s,stations}=validationRows(getData()),f=(n)=>Number.isFinite(n)?n.toFixed(2):'—';
    const rows=stations.filter((r)=>Number.isFinite(r.insarCm)&&Number.isFinite(r.gnssCm));
    const max=Math.max(1,...rows.flatMap((r)=>[Math.abs(r.insarCm),Math.abs(r.gnssCm)])),scale=130/max;
    const dots=rows.map((r)=>`<circle cx="${200+r.gnssCm*scale}" cy="${170-r.insarCm*scale}" r="5"><title>${e(r.station)}: GNSS ${r.gnssCm} cm; radar ${r.insarCm} cm</title></circle>`).join('');
    $('[data-content="validation"]').innerHTML=`<div class="iv-section-head"><p class="iv-eyebrow">SHOW THE CHECK, INCLUDING ITS LIMITS</p><h2>Does the measurement<br>survive an independent check?</h2><p>Central Valley · track 114 descending · station-to-${e(stack?.cumulativeGnss?.reference||'reference')} LOS differences. This check applies to the processed GUNW stack, not the Delta HH/HV images.</p></div>${rows.length?`<div class="iv-verdict"><span>UNRESOLVED IN THIS SAMPLE</span><h3>Small motion is not resolved by this comparison.</h3><p>The radar residual is larger than a zero-motion baseline for these same station differences. Treat the derived displacement as investigatory.</p></div><div class="iv-metrics"><div><b>${s.count}</b><span>STATION DIFFERENCES</span></div><div><b>${f(s.rmsCm)} <small>cm</small></b><span>RADAR − GNSS RMS</span></div><div><b>${f(s.zeroMotionRmsCm)} <small>cm</small></b><span>ZERO-MOTION BASELINE RMS</span></div><div><b>${f(s.correlation)}</b><span>CORRELATION</span></div></div><div class="iv-validation-grid"><figure class="iv-scatter"><svg viewBox="0 0 400 365" role="img" aria-label="Station GNSS versus radar LOS comparison. All stations are listed in the adjacent table."><path d="M35 170H365 M200 15V325" class="iv-axis"/><path d="M${200-145} ${170+145}L${200+145} ${170-145}" class="iv-one"/>${dots}<text x="200" y="353" text-anchor="middle">GNSS LOS · cm (range ±${f(max)})</text><text x="14" y="170" text-anchor="middle" transform="rotate(-90 14 170)">Radar LOS · cm</text></svg><figcaption>Dashed line: 1:1 agreement. Points: all ${s.count} station differences. This is not an uncertainty ellipse or a regional accuracy estimate.</figcaption></figure><div class="iv-table-wrap"><table><caption>All bundled comparison samples · cm</caption><thead><tr><th>Station</th><th>Radar</th><th>GNSS</th><th>Residual</th></tr></thead><tbody>${rows.map((r)=>`<tr><th scope="row">${e(r.station)}</th><td>${f(r.insarCm)}</td><td>${f(r.gnssCm)}</td><td>${f(r.insarCm-r.gnssCm)}</td></tr>`).join('')}</tbody></table><button data-iv="validation-csv">Download all station rows CSV</button></div></div><div class="iv-method-card"><h3>How to interpret the check</h3><p>RMS = √mean((radar − GNSS)²). The baseline predicts 0 cm for each of these same GNSS station differences. Samples share a reference station, so their errors are correlated. Station selection, time window, atmosphere, referencing and geometry can affect the result.</p><p>Next evidence needed: matched-date independent checks, full uncertainty propagation, residual atmospheric assessment and additional sites. No stations are removed here to improve the score.</p><button data-iv="central">Inspect the Central Valley map ↗</button></div>`:'<p>No station comparison is available in this bundled archive.</p>'}`;
  }
  function methods() {
    const d=getData(),c=datasetCounts(d.nisar),span=seriesSpan((d.gnss?.['nile-delta']||[])[0]);
    $('[data-content="methods"]').innerHTML=`<div class="iv-section-head"><p class="iv-eyebrow">TRACE EVERY CLAIM</p><h2>Different evidence.<br>Different questions.</h2><p>Bundled archive snapshot: ${e(d.nisar?.generatedAt||'unavailable')}. These are local files, not a live monitoring feed.</p></div><div class="iv-method-grid"><article><span>01 / LEARN</span><h3>Illustrative worlds</h3><p>The Journey, Interference Lab, pixel island and coastal rate scenarios explain mechanisms. They do not generate measurements or forecasts.</p></article><article><span>02 / OBSERVE</span><h3>Qualitative previews</h3><p>${c.gcovFrames} Delta HH/HV previews and ${c.pairs} unique GUNW pairs across ${c.sites} radar sites. Browse RGB values are for visual interpretation. Full GCOV contains calibrated radar power; this viewer does not perform that analysis.</p></article><article><span>03 / MEASURE</span><h3>Derived LOS</h3><p>${c.processed} full GUNW pairs are processed in the bundled Central Valley stack. Coherence masking, ionosphere correction and referencing are recorded per pair. Atmosphere and other errors can remain. One look direction does not isolate vertical motion.</p></article><article><span>04 / CHECK</span><h3>Independent context</h3><p>All nine station differences are exposed in Validation. Delta ALX2 is historical context${span?` (${span.start} to ${span.end})`:''}; it ends before the 2026 previews and cannot validate their water or ground-motion interpretation.</p></article></div><div class="iv-method-card"><h3>What is known, and what is not</h3><ul>${LIMITS.map((s)=>`<li>${e(s)}</li>`).join('')}</ul></div><div class="iv-method-card"><h3>Check this bundled copy</h3><p>Verify the two selected preview files against the local SHA-256 audit manifest. A matching fingerprint checks file consistency, not product authenticity, scientific accuracy or an official endorsement.</p><button data-iv="verify">Verify selected files</button><p class="iv-integrity" role="status">Not checked in this session.</p><a href="data/review/audit.json" target="_blank" rel="noopener">Open bundled audit manifest ↗</a></div><div class="iv-method-card"><h3>Reproduce & extend</h3><p>Use the actual granule IDs in Acquisition IDs & alignment. Retrieve the full provisional product through ASF, read its quality layers, align comparable acquisitions and test interpretations against independent records. Keep unknown pixels unknown. The repository pipeline and audit script describe the bundled processing; this desk performs no new geophysical retrieval.</p><h3>Primary references</h3><ul>${METHODS.map((s)=>`<li><a href="${e(s.url)}" target="_blank" rel="noopener">${e(s.title)} ↗</a></li>`).join('')}</ul><h3>Art & authorship</h3><p>Journey panoramas and game key art were generated with OpenAI image generation and adapted for Fringe. Pixel animation, world rules and ambient sound are procedural. Satellite previews and station data are scientific source material, separate from generated illustrations. User notebook entries are unverified and remain on this device until exported.</p></div>`;
  }
  async function verify() {
    const selected=pair,rev=revision,el=$('.iv-integrity');if(!selected)return;
    if(!crypto.subtle){el.textContent='SHA-256 unavailable here. Use localhost or HTTPS, or run the repository audit.';return;}
    el.textContent='Checking selected files…';
    try {
      if(!audit){const r=await fetch('data/review/audit.json',{cache:'no-cache'});if(!r.ok)throw Error('Audit manifest unavailable');audit=await r.json();}
      const checks=await Promise.all([selected.earlier,selected.later].map(async(f)=>{const path=`data/${f.file}`,expected=audit.files?.find((x)=>x.path===path);if(!expected)throw Error('Preview is not in the audit manifest');const r=await fetch(path,{cache:'no-cache'});if(!r.ok)throw Error('A selected preview is unavailable');const bytes=await r.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map((v)=>v.toString(16).padStart(2,'0')).join('');return {path,expectedSha256:expected.sha256,actualSha256:hash,matches:hash===expected.sha256&&bytes.byteLength===expected.bytes};}));
      if(rev!==revision){el.textContent='Selection changed. Verify the current pair again.';return;}
      integrity={checkedAt:new Date().toISOString(),files:checks};el.textContent=checks.every((c)=>c.matches)?'Both selected files match the bundled manifest. Scientific accuracy is not certified.':'A file differs from the bundled manifest. Re-run the audit before sharing this copy.';
    }catch(err){el.textContent=`Could not verify: ${err.message}. No match is assumed.`;}
  }
  async function imageData(f) {const r=await fetch(`data/${f.file}`);if(!r.ok)throw Error('Preview unavailable');const blob=await r.blob();if(!blob.type.startsWith('image/'))throw Error('Unexpected preview type');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
  async function exportBrief() {
    if(!pair)return;const selected=pair,brief=buildBrief({data:getData(),pair:selected,notebook,pin,integrity});status('Preparing brief with actual preview images…');
    const results=await Promise.allSettled([imageData(selected.earlier),imageData(selected.later)]),images={};results.forEach((r,i)=>{if(r.status==='fulfilled')images[i?'later':'earlier']=r.value;});
    downloadFile(`fringe-delta-${selected.earlier.date}-${selected.later.date}.html`,briefHtml(brief,images),'text/html');status(results.every((r)=>r.status==='fulfilled')?'Illustrated brief downloaded. Open it in a browser to read or print to PDF.':'Brief downloaded with an explicit placeholder for each unavailable preview.');
  }
  $('.iv-note-form').addEventListener('submit',(ev)=>{
    ev.preventDefault();if(!pair||notebook.notes.length>=20)return;const form=ev.currentTarget,fields=new FormData(form);
    const note=makeNote({id:`n${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`,a:pair.earlier.date,b:pair.later.date,pin,observation:fields.get('observation'),hypothesis:fields.get('hypothesis'),nextCheck:fields.get('nextCheck'),createdAt:new Date().toISOString()},frames);
    if(!note){status('Add a visible observation before saving.');return;}notebook.notes.push(note);save();renderNotes();form.reset();status('Observation saved with its dates and image pin. Interpretation remains unverified.');
  });
  $('.iv-question').addEventListener('change',()=>{notebook.question=$('.iv-question').value.trim().slice(0,240)||readNotebook(null,frames).question;$('.iv-question').value=notebook.question;save();});
  $('.iv-date-a').addEventListener('change',()=>updatePair($('.iv-date-a').value,$('.iv-date-b').value));$('.iv-date-b').addEventListener('change',()=>updatePair($('.iv-date-a').value,$('.iv-date-b').value));
  $('.iv-swipe').addEventListener('input',(ev)=>{const v=ev.target.value;$('.iv-footprint').style.setProperty('--reveal',`${v}%`);ev.target.setAttribute('aria-valuetext',`${v} percent`);});
  for(const img of all('.iv-layer img')) {img.addEventListener('error',()=>{img.hidden=true;img.nextElementSibling.hidden=false;});img.addEventListener('load',()=>{img.hidden=false;img.nextElementSibling.hidden=true;});}
  $('.iv-pin-target').addEventListener('click',(ev)=>{const r=ev.currentTarget.getBoundingClientRect();pin=validPin(ev.detail?{x:(ev.clientX-r.left)/r.width,y:(ev.clientY-r.top)/r.height}:{x:.5,y:.5});updatePin();});
  $('.iv-pin-target').addEventListener('keydown',(ev)=>{const delta={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]}[ev.key];if(!delta)return;ev.preventDefault();pin=pin||{x:.5,y:.5};pin=validPin({x:Math.max(0,Math.min(1,pin.x+delta[0])),y:Math.max(0,Math.min(1,pin.y+delta[1]))});updatePin();});
  root.addEventListener('click',async(ev)=>{
    const b=ev.target.closest('button');if(!b)return;
    if(b.dataset.panel){showPanel(b.dataset.panel);return;}if(b.dataset.mode){setMode(b.dataset.mode);return;}
    if(b.dataset.note){const n=notebook.notes.find((n)=>n.id===b.dataset.note);if(n){pin=n.pin;updatePair(n.a,n.b);updatePin();}return;}
    if(b.dataset.remove){notebook.notes=notebook.notes.filter((n)=>n.id!==b.dataset.remove);save();renderNotes();status('Observation deleted.');return;}
    const action=b.dataset.iv;
    if(action==='map')onMap({observationDate:pair?.later.date});
    if(action==='central')onMap({eventId:'central-valley'});
    if(action==='clear-pin'){pin=null;updatePin();}
    if(action==='flip'){stopBlink();showBlink(!blinkLater);}
    if(action==='blink'){if(blink)stopBlink();else {blink=setInterval(()=>showBlink(!blinkLater),1200);b.textContent='Pause blink';}}
    if(action==='verify')await verify();
    if(action==='validation-csv')downloadFile('fringe-central-valley-all-stations.csv',comparisonCsv(validationRows(getData()).stack?.cumulativeGnss),'text/csv');
    if(action==='csv')downloadFile('fringe-visual-notes.csv',notesCsv(notebook.notes),'text/csv');
    if(action==='json'&&pair)downloadFile('fringe-investigation.json',JSON.stringify({notebook,brief:buildBrief({data:getData(),pair,notebook,pin,integrity})},null,2));
    if(action==='brief'){b.disabled=true;try {await exportBrief();}catch {status('The brief could not be created. Export the notebook JSON instead.');}finally {b.disabled=false;}}
    if(action==='share'&&pair){const url=shareUrl(location.href,pair,pin,panel);try{await navigator.clipboard.writeText(url);status('Comparison link copied. Your private notes are not included.');}catch{const link=$('.iv-share-fallback');link.href=url;link.hidden=false;status('Clipboard unavailable. Use the comparison link beside this button. Notes are not included.');}}
  });
  $('.iv-import-file').addEventListener('change',async(ev)=>{
    const file=ev.target.files?.[0];if(!file)return;
    try{if(file.size>300000)throw Error('file too large');const v=JSON.parse(await file.text()),candidate=v.notebook||v,imported=readNotebook(candidate,frames);if(candidate.version!==1||!Array.isArray(candidate.notes))throw Error('invalid format');if(!imported.notes.length&&candidate.notes.length)throw Error('no valid acquisition-linked notes');notebook.notes=[...new Map([...notebook.notes,...imported.notes].map((n)=>[n.id,n])).values()].slice(0,20);if(!notebook.notes.length)notebook.question=imported.question;save();renderNotes();status('Valid notes imported and merged. Existing notes are retained; maximum 20.');}catch{status('Import rejected. Use a Fringe notebook JSON with valid indexed dates (maximum 300 KB).');}ev.target.value='';
  });
  $('.iv-tabs').addEventListener('keydown',(ev)=>{const tabs=all('[role="tab"][data-panel]'),i=tabs.indexOf(document.activeElement);if(i<0)return;let n;if(ev.key==='ArrowRight')n=(i+1)%3;if(ev.key==='ArrowLeft')n=(i+2)%3;if(ev.key==='Home')n=0;if(ev.key==='End')n=2;if(n===undefined)return;ev.preventDefault();showPanel(tabs[n].dataset.panel);tabs[n].focus();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopBlink();});
  function refreshData() {
    frames=framesFor(getData());if(!notebook)notebook=readNotebook(raw,frames);
    $('.iv-question').value=notebook.question;const options=frames.map((f)=>`<option value="${f.date}">${f.date}</option>`).join('');$('.iv-date-a').innerHTML=options;$('.iv-date-b').innerHTML=options;
    $('.iv-empty').hidden=frames.length>=2;$('.iv-compare-content').hidden=frames.length<2;
    updatePair(pair?.earlier.date||initial.a,pair?.later.date||initial.b);updatePin();renderNotes();validation();methods();showPanel(panel);
    $('.iv-storage').textContent=persisted?'Notes stay on this device until you export them.':'Storage unavailable. Export notes before leaving.';
  }
  showPanel(panel);
  return {refreshData,setActive(value){active=value;if(!value)stopBlink();else {loadPairImages();syncUrl();}},open(selection={}){if(selection.a||selection.b)updatePair(selection.a,selection.b);if(selection.pin!==undefined){pin=validPin(selection.pin);updatePin();}showPanel(selection.panel||'compare');},};
}
