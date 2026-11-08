import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {framesFor,selectPair,validPin,readSelection,shareUrl,readNotebook,makeNote,notesCsv,buildBrief,briefHtml,validationRows} from '../investigation-core.js';
const json=async(p)=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const data={nisar:await json('../data/nisar/index.json'),gnss:{'nile-delta':[await json('../data/gnss/nile-delta-ALX2.json')]}};
const frames=framesFor(data),pair=selectPair(frames);
const note={id:'test-note',a:pair.earlier.date,b:pair.later.date,pin:{x:.2,y:.4},observation:'A bright patch is visible.',hypothesis:'Possible surface or processing difference.',nextCheck:'Check matching-date field records.',createdAt:'2026-11-07T00:00:00Z'};
test('comparison uses actual indexed dates and preserves unknown alignment',()=>{
 assert.equal(frames.length,9);assert.equal(pair.days,108);assert.equal(pair.between,7);assert.equal(pair.earlier.fitRmsPx,null);assert.ok(pair.earlier.granule.startsWith('NISAR_'));
 const p=selectPair(frames,frames[8].date,frames[0].date);assert.equal(p.earlier.date,frames[0].date);
 assert.notEqual(selectPair(frames,frames[8].date,frames[8].date).earlier.date,frames[8].date);
 assert.equal(selectPair([]),null);
});
test('unavailable or unsafe image records cannot become substitute data',()=>{
 assert.deepEqual(framesFor(null),[]);
 const bad={nisar:{sites:{'nile-delta':{gcov:{frames:[{date:'2026-06-26',file:'nisar/../../secret.webp'},{date:'2026-02-30',file:'nisar/f.webp'},{date:'2026-06-27',file:'https://outside/image.webp'}]}}}}};assert.deepEqual(framesFor(bad),[]);
});
test('shared selection excludes private notes and unrelated URL state',()=>{
 const url=shareUrl('https://example.test/?notes=private&live=1,2#game',pair,{x:.2,y:.4},'validation');
 assert.equal(new URL(url).hash,'#investigate');assert.ok(!url.includes('private'));assert.ok(!url.includes('live='));
 assert.deepEqual(readSelection(url),{a:pair.earlier.date,b:pair.later.date,pin:{x:.2,y:.4},panel:'validation'});
 assert.equal(readSelection('http://local/?px=2&py=-1&panel=evil').pin,null);
});
test('pins reject coerced, out-of-range and nonfinite coordinates',()=>{
 for(const p of [null,{x:'0',y:0},{x:NaN,y:0},{x:1.01,y:0},{x:0,y:-.1}])assert.equal(validPin(p),null);
 assert.deepEqual(validPin({x:.123456,y:1}),{x:.1235,y:1});
});
test('notebook import keeps only real ordered acquisitions and bounded unique observations',()=>{
 const n=readNotebook({version:1,notes:[note,{...note},{...note,id:'other',a:'2000-01-01'},{...note,id:'reverse',a:note.b,b:note.a},{...note,id:'empty',observation:'  '}]},frames);assert.equal(n.notes.length,1);
 assert.equal(readNotebook('{broken',frames).notes.length,0);assert.equal(readNotebook({version:2,notes:[note]},frames).notes.length,0);
 assert.equal(readNotebook({version:1,notes:Array.from({length:25},(_,i)=>({...note,id:`n${i}`,observation:'x'.repeat(1000)}))},frames).notes.length,20);
 assert.equal(makeNote({...note,observation:'x'.repeat(1000)},frames).observation.length,800);
});
test('notebook CSV resists formula-like user input including leading whitespace',()=>{
 const csv=notesCsv([{...note,observation:'  =HYPERLINK("bad")',hypothesis:'+SUM(1,2)'}]);assert.match(csv,/'  =HYPERLINK/);assert.match(csv,/'\+SUM/);assert.match(csv,/"0.2","0.4"/);assert.equal(csv.split('\r\n').length,2);
});
test('brief preserves granules, historical mismatch and unverified authorship',()=>{
 const brief=buildBrief({data,pair,notebook:readNotebook({version:1,notes:[note]},frames),pin:note.pin,now:new Date('2026-11-07T00:00:00Z')});
 assert.equal(brief.comparison.earlier.granule,pair.earlier.granule);assert.equal(brief.comparison.earlier.browseToMapFitRmsPx,null);assert.match(brief.comparison.classification,/No automated/);assert.match(brief.notes[0].authorship,/not independently verified/);assert.equal(brief.gnssContext[0].dates.end,'2024-12-04');assert.equal(brief.generatedAt,'2026-11-07T00:00:00.000Z');
 assert.throws(()=>buildBrief({data,pair:null,notebook:{notes:[]}}));
});
test('portable brief escapes user HTML and rejects active image payloads',()=>{
 const brief=buildBrief({data,pair,notebook:{question:'<script>evil()</script>',notes:[{...note,observation:'<img src=x onerror=evil()>'}]}}),html=briefHtml(brief,{earlier:'javascript:evil()',later:'data:image/webp;base64,AAAA'});
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('src="javascript:'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('data:image/webp;base64,AAAA'));assert.match(html,/Preview not embedded/);
});
test('validation exposes the full sample and zero-motion comparison',()=>{
 const v=validationRows(data);assert.equal(v.stations.length,9);assert.equal(v.summary.status,'unresolved');assert.ok(v.summary.rmsCm>v.summary.zeroMotionRmsCm);
});
