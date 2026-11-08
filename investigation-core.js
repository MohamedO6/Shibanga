import { dateMs, validationSummary, seriesSpan, csvCell } from "./science.js?v=10.0";
import { observationFrames } from "./learn-content.js?v=10.0";

export const NOTEBOOK_KEY="fringe.investigation.v1";
export const METHODS=[
  {title:"NISAR GCOV user guide",url:"https://nisar-docs.asf.alaska.edu/gcov/"},
  {title:"NISAR GUNW user guide",url:"https://nisar-docs.asf.alaska.edu/gunw/"},
  {title:"NASA NISAR polarimetry",url:"https://science.nasa.gov/mission/nisar/polarimetry/"},
  {title:"ASF NISAR data search",url:"https://search.asf.alaska.edu/#/?dataset=NISAR"},
  {title:"Nevada Geodetic Laboratory",url:"https://geodesy.unr.edu/"},
];
export const LIMITS=[
  "These are qualitative HH/HV browse composites, not calibrated backscatter values or a validated flood/crop classification.",
  "Colour differences can reflect scattering, surface conditions, acquisition/processing and image alignment. They do not identify a cause by themselves.",
  "The bundled images share a track and display footprint. Alignment fit is a browse-to-map metric, not a scientific uncertainty estimate; an unreported fit is unknown.",
  "The historical ALX2 GNSS series ends before these radar dates. It does not validate water change or contemporary ground motion.",
  "A visual inspection pin is an image coordinate, not a surveyed field location. User notes are hypotheses and observations awaiting independent checks.",
];
const clean=(v,n=800)=>typeof v==="string"?v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").trim().slice(0,n):"";
export const escapeHtml=(s)=>String(s??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function framesFor(data) {
  return [...new Map(observationFrames(data).filter((f)=>/^nisar\/[a-zA-Z0-9_/-]+\.webp$/.test(f.file)).map((f)=>[f.date,f])).values()];
}
export function selectPair(frames,a,b) {
  if(frames.length<2)return null;
  const first=frames.find((f)=>f.date===a)||frames[0],last=frames.find((f)=>f.date===b)||frames.at(-1);
  let earlier=first.date<last.date?first:last,later=first.date<last.date?last:first;
  if(earlier.date===later.date) {const i=frames.indexOf(earlier);if(i<frames.length-1)later=frames[i+1];else earlier=frames[i-1];}
  const days=(dateMs(later.date)-dateMs(earlier.date))/864e5;
  const between=frames.filter((f)=>f.date>earlier.date&&f.date<later.date).length;
  return {earlier,later,days,between,track:"007_D_073",kind:"qualitative-preview",sameFootprint:true};
}
export function validPin(pin) {
  return pin && [pin.x,pin.y].every((n)=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1)?{x:Math.round(pin.x*10000)/10000,y:Math.round(pin.y*10000)/10000}:null;
}
export function readSelection(url) {
  try {const u=new URL(url,"http://localhost/");const n=(k)=>u.searchParams.has(k)?Number(u.searchParams.get(k)):NaN;
    return {a:dateMs(u.searchParams.get("a"))!==null?u.searchParams.get("a"):null,b:dateMs(u.searchParams.get("b"))!==null?u.searchParams.get("b"):null,pin:validPin({x:n("px"),y:n("py")}),panel:["compare","validation","methods"].includes(u.searchParams.get("panel"))?u.searchParams.get("panel"):"compare"};
  } catch {return {a:null,b:null,pin:null,panel:"compare"};}
}
export function shareUrl(base,pair,pin,panel="compare") {
  const u=new URL(base);u.search="";u.hash="investigate";
  if(pair){u.searchParams.set("a",pair.earlier.date);u.searchParams.set("b",pair.later.date);}
  const p=validPin(pin);if(p){u.searchParams.set("px",String(p.x));u.searchParams.set("py",String(p.y));}
  if(panel!=="compare")u.searchParams.set("panel",panel);
  return u.href;
}
export function readNotebook(raw,frames) {
  let value;try{value=typeof raw==="string"?JSON.parse(raw):raw;}catch{}
  const dates=new Set(frames.map((f)=>f.date));
  const notes=value?.version===1&&Array.isArray(value.notes)?value.notes:[];
  const seen=new Set(),out=[];
  for(const n of notes) {
    if(!n||typeof n.id!=="string"||!/^[a-zA-Z0-9_-]{1,64}$/.test(n.id)||seen.has(n.id)||!dates.has(n.a)||!dates.has(n.b)||n.a>=n.b)continue;
    const observation=clean(n.observation);if(!observation)continue;
    seen.add(n.id);out.push({id:n.id,a:n.a,b:n.b,pin:validPin(n.pin),observation,hypothesis:clean(n.hypothesis),nextCheck:clean(n.nextCheck),createdAt:typeof n.createdAt==="string"&&Number.isFinite(Date.parse(n.createdAt))?new Date(n.createdAt).toISOString():null});
    if(out.length===20)break;
  }
  return {version:1,question:clean(value?.question,240)||"How does the radar echo differ between these visits, and what would explain it?",notes:out};
}
export function makeNote({id,a,b,pin,observation,hypothesis,nextCheck,createdAt},frames) {
  return readNotebook({version:1,notes:[{id,a,b,pin,observation,hypothesis,nextCheck,createdAt}]},frames).notes[0]||null;
}
export function notesCsv(notes) {
  return [["note_id","earlier_acquisition","later_acquisition","image_x_fraction","image_y_fraction","visual_observation_unverified","hypothesis_unverified","independent_check_needed","created_at"],
    ...notes.map((n)=>[n.id,n.a,n.b,n.pin?.x??"",n.pin?.y??"",n.observation,n.hypothesis,n.nextCheck,n.createdAt])].map((r)=>r.map(csvCell).join(",")).join("\r\n");
}
export function validationRows(data) {
  const stack=data?.nisar?.sites?.["central-valley"]?.stacks?.["114_D_070"];
  return {stack,summary:validationSummary(stack?.cumulativeGnss),stations:stack?.cumulativeGnss?.stations||[]};
}
export function buildBrief({data,pair,notebook,pin,integrity=null,now=new Date()}) {
  if(!pair)throw new Error("Two actual acquisition dates are required.");
  const frame=(f)=>({date:f.date,granule:f.granule||null,browseAsset:`data/${f.file}`,browseToMapFitRmsPx:Number.isFinite(f.fitRmsPx)?f.fitRmsPx:null});
  const series=data.gnss?.["nile-delta"]||[];
  return {schema:"fringe.visual-investigation/1",generatedAt:now.toISOString(),question:clean(notebook.question,240),site:{id:"nile-delta",name:"Nile Delta, Egypt",bounds:data.nisar?.sites?.["nile-delta"]?.bounds||null},
    dataset:{mission:"NASA-ISRO NISAR",collection:"NISAR_L2_GCOV_PROVISIONAL_V1",maturity:"Provisional",representation:"Qualitative HH/HV browse composite",composite:data.nisar?.sites?.["nile-delta"]?.gcov?.composite||"R = HH, G = HV, B = HH",bundleGeneratedAt:data.nisar?.generatedAt||null},
    comparison:{earlier:frame(pair.earlier),later:frame(pair.later),elapsedDays:pair.days,intermediateBundledAcquisitions:pair.between,track:pair.track,classification:"No automated classification or quantitative change estimate performed."},
    inspectionPin:validPin(pin),notes:notebook.notes.map((n)=>({...n,authorship:"User-authored visual observation/hypothesis; not independently verified."})),
    conclusion:notebook.notes.length?"This brief records user-authored visual observations and proposed checks. No cause or quantitative change is certified.":"No visual observation recorded. This brief documents the selected pair, provenance and limitations.",
    gnssContext:series.map((s)=>({station:s.station,dates:seriesSpan(s),role:"Historical context, not validation of these HH/HV previews."})),
    fileIntegrity:integrity,integrityScope:"File fingerprints check this bundled copy against its local audit manifest. They do not certify NASA product authenticity or scientific accuracy.",limitations:LIMITS,sources:METHODS};
}
export function briefHtml(brief,images={}) {
  const e=escapeHtml, c=brief.comparison;
  const safeImage=(s)=>typeof s==="string"&&/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s)?s:null;
  const figure=(frame,key)=>`<figure>${safeImage(images[key])?`<img src="${safeImage(images[key])}" alt="Actual NISAR qualitative HH/HV preview, ${e(frame.date)}">`:'<div class="missing">Preview not embedded; use the asset reference below.</div>'}<figcaption><b>${e(frame.date)}</b> · ${e(frame.browseAsset)}<br><small>${e(frame.granule)}</small></figcaption></figure>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fringe · Visual investigation brief</title><style>body{font:15px/1.65 system-ui,sans-serif;color:#183633;background:#f7f6ed;max-width:980px;margin:40px auto;padding:0 24px}h1{font-size:38px;line-height:1.1;letter-spacing:-.045em}h2{font-size:21px;margin-top:28px}.k{font-size:11px;letter-spacing:.15em;color:#58776b}.tag{display:inline-block;padding:4px 10px;border:1px solid #9eae94;margin-right:6px;font-size:11px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0;min-width:0}img{width:100%;display:block}figcaption{font-size:11px;overflow-wrap:anywhere}small{color:#537365}.note{padding:16px;border:1px solid #c1cbb5;margin:14px 0;break-inside:avoid}.note p{margin:8px 0}.missing{padding:55px 20px;background:#e0e8dc}li{margin-bottom:8px}a{color:#1b6256}footer{border-top:1px solid #b7c6af;padding-top:16px;margin-top:30px;font-size:11px}@media(max-width:600px){.pair{grid-template-columns:1fr}}@media print{body{margin:0;font-size:10pt;background:white}h1{font-size:24pt}img{max-height:84mm;object-fit:contain}.pair{break-inside:avoid}a{color:inherit;text-decoration:none}@page{size:A4;margin:16mm}}</style></head><body><p class="k">FRINGE / VISUAL INVESTIGATION BRIEF</p><h1>${e(brief.question)}</h1><p><span class="tag">ACTUAL NISAR</span><span class="tag">QUALITATIVE PREVIEW</span><span class="tag">PROVISIONAL</span></p><p>${e(brief.site.name)} · ${e(c.earlier.date)} → ${e(c.later.date)} · ${c.elapsedDays} days · Track ${e(c.track)}</p><div class="pair">${figure(c.earlier,"earlier")}${figure(c.later,"later")}</div><h2>What this brief establishes</h2><p>${e(brief.conclusion)}</p>${brief.inspectionPin?`<p>Visual inspection pin: x=${brief.inspectionPin.x}, y=${brief.inspectionPin.y} of the image. Not a surveyed coordinate.</p>`:""}<h2>Field notebook</h2>${brief.notes.length?brief.notes.map((n)=>`<article class="note"><small>${e(n.a)} → ${e(n.b)} · User-authored, unverified</small><p><b>Visual observation:</b> ${e(n.observation)}</p><p><b>Hypothesis:</b> ${e(n.hypothesis)||"Not recorded"}</p><p><b>Independent check needed:</b> ${e(n.nextCheck)||"Not recorded"}</p></article>`).join(""):"<p>No observations recorded.</p>"}<h2>Methods and limitations</h2><p>Comparison of bundled georeferenced browse composites. No calibrated pixel analysis, area estimate or automated flood/crop classification was performed.</p><ul>${brief.limitations.map((s)=>`<li>${e(s)}</li>`).join("")}</ul><h2>Historical context</h2>${brief.gnssContext.length?brief.gnssContext.map((s)=>`<p>${e(s.station)}: ${e(s.dates?.start)} to ${e(s.dates?.end)}. ${e(s.role)}</p>`).join(""):"<p>No GNSS context was bundled for this case.</p>"}<h2>Sources and reproduction</h2><ul>${brief.sources.map((s)=>`<li><a href="${e(s.url)}">${e(s.title)}</a></li>`).join("")}</ul><p>Collection: ${e(brief.dataset.collection)}. Bundle snapshot: ${e(brief.dataset.bundleGeneratedAt)}.</p><p>${e(brief.integrityScope)}</p><footer>Generated ${e(brief.generatedAt)}. Fringe supports education and investigation. This brief is not an operational warning, field validation or NASA endorsement.</footer></body></html>`;
}
