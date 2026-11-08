import { TILE, COLS, ROWS, OBJECTS, HOUSES, TREES, tileAt, stageOf, targetOf, bridgeOpen } from "./game-core.js?v=10.0";

const P = { grass:"#497e54", dark:"#254b3e", grass2:"#568858", crop:"#718d4b", light:"#a1af61", path:"#c9b77e", sand:"#dfce9c", water:"#235d69", water2:"#327a80", mint:"#9de5c6", gold:"#edc46c", ink:"#153439" };
const noise = (x,y,k=0) => { const v=Math.sin(x*127.1+y*311.7+k*74.7)*43758.5453; return v-Math.floor(v); };
const box = (c,x,y,w,h,color) => { c.fillStyle=color; c.fillRect(Math.round(x),Math.round(y),w,h); };
const text = (c,s,x,y,color=P.sand,size=6) => { c.fillStyle=color;c.font=`${size}px monospace`;c.textAlign="center";c.fillText(s,Math.round(x),Math.round(y)); };

function palm(c,x,y) {
  box(c,x-6,y+4,18,5,"#173f3840");
  box(c,x+1,y-12,4,19,"#654d38");box(c,x+2,y-10,2,16,"#b18b53");
  [[-13,-16,13,4],[-8,-20,13,4],[-3,-23,6,6],[5,-18,14,4],[-16,-12,6,4],[13,-14,7,4],[-9,-9,9,3],[7,-11,8,4]].forEach(([a,b,w,h],i)=>box(c,x+a,y+b,w,h,i%2?"#366e43":"#69924c"));
  box(c,x-2,y-18,7,6,"#9aa651");box(c,x+1,y-12,4,3,"#cbaf60");
}
function house(c,x,y,w,h,station=false) {
  const px=x*TILE,py=y*TILE;
  box(c,px+5,py+6,w*TILE,h*TILE,"#173c3b55");
  box(c,px,py,w*TILE,h*TILE,"#b5a379");box(c,px+3,py+3,w*TILE-6,h*TILE-3,"#e0cfa1");
  box(c,px-3,py-7,w*TILE+6,13,"#657e70");box(c,px-3,py-7,w*TILE+6,3,"#9caf8c");box(c,px,py+3,w*TILE,3,"#4d655d");
  for(let a=8;a<w*TILE-10;a+=22) { box(c,px+a,py+14,12,12,"#566e65");box(c,px+a+2,py+16,8,7,"#88b6a0");box(c,px+a+6,py+16,1,8,"#cebd8e"); }
  box(c,px+w*TILE/2-5,py+h*TILE-17,11,17,"#2d524a");box(c,px+w*TILE/2+2,py+h*TILE-10,2,2,P.gold);
  if(station) {
    box(c,px+8,py-16,28,10,"#203e51");box(c,px+10,py-14,24,6,"#406779");
    for(let i=0;i<4;i++) box(c,px+11+i*6,py-15,1,9,"#76969c");
    box(c,px+60,py-30,2,24,"#d8c99a");box(c,px+55,py-26,12,3,"#c6d7b5");
    text(c,"FIELD STATION",px+w*TILE/2,py+h*TILE+12,"#f2dfac",6);
  }
}
function terrain(s) {
  const canvas=document.createElement("canvas");canvas.width=COLS*TILE;canvas.height=ROWS*TILE;
  const c=canvas.getContext("2d");c.imageSmoothingEnabled=false;
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) {
    const k=tileAt(x,y,s),px=x*TILE,py=y*TILE,shade=noise(x,y);
    box(c,px,py,16,16,k==="water"?P.water:k==="bridge"?"#a78959":k==="path"?P.path:k==="wetland"?"#438b79":k==="crop"?P.crop:shade>.5?P.grass:P.grass2);
    if(k==="water") {box(c,px,py,16,2,"#2c6c74");box(c,px+3,py+8,7,1,"#40868a");}
    else if(k==="bridge") {
      for(let i=1;i<16;i+=4) box(c,px,py+i,16,1,"#5d6449");
      box(c,px,py,2,16,"#d2b47d");box(c,px+14,py,2,16,"#796a46");
    } else if(k==="crop" || k==="wetland") {
      for(let j=2;j<16;j+=5) for(let i=2;i<16;i+=5) {
        box(c,px+i,py+j,2,4,k==="wetland"?"#98b96c":"#a9ac5b");box(c,px+i+1,py+j-1,2,2,"#c6bd6c");
      }
    } else if(k==="path") {
      for(let i=0;i<3;i++) box(c,px+Math.floor(noise(x,y,i+1)*14),py+Math.floor(noise(y,x,i+3)*14),2,1,"#af9b6a");
    } else {
      for(let i=0;i<3;i++) box(c,px+Math.floor(noise(x,y,i+1)*14),py+Math.floor(noise(y,x,i+3)*14),1,2,i%2?"#83a15f":"#376944");
      if(shade>.94) { box(c,px+5,py+5,2,2,"#dbc78a");box(c,px+9,py+10,2,2,"#dbc78a"); }
    }
  }
  // The closed north bridge is a physical obstacle until the paired-date relay is restored.
  if(!bridgeOpen(s)) { box(c,18*TILE-3,8*TILE-2,38,3,"#d4a65a");box(c,18*TILE-3,10*TILE,38,3,"#d4a65a"); }
  HOUSES.forEach((h,i)=>house(c,...h,i===0));
  TREES.forEach(([x,y])=>palm(c,x*TILE+8,y*TILE+8));
  // Irrigation banks, crates, moored skiff and solar station details.
  box(c,16*TILE+3,24*TILE+2,8,24,"#d4ad68");box(c,16*TILE+5,24*TILE+5,4,18,"#795b40");
  [[160,395],[146,398],[555,388]].forEach(([x,y])=>{box(c,x,y,9,8,"#96724e");box(c,x+1,y+1,7,1,"#d7b77b");box(c,x+4,y,1,8,"#5e674c");});
  return canvas;
}
export function drawEcho(c,x,y,t=0,large=1) {
  c.save();c.translate(Math.round(x),Math.round(y));c.scale(large,large);
  box(c,-7,7,14,3,"#143c3c55");
  const bob=Math.round(Math.sin(t*2)*1);c.translate(0,bob);
  box(c,-7,-9,14,13,"#dcd7af");box(c,-9,-6,18,8,"#eee7c5");
  box(c,-6,-5,12,6,"#24464b");box(c,-4,-4,2,3,"#9cebdc");box(c,2,-4,2,3,"#9cebdc");
  box(c,-13,-4,5,3,"#6cbaa8");box(c,9,-4,5,3,"#6cbaa8");box(c,-2,5,4,3,"#b5f1ce");box(c,-3,-11,6,2,"#8ca998");
  c.restore();
}
function player(c,s) {
  const x=Math.round(s.x),y=Math.round(s.y),walk=s.moving?Math.floor(s.walk/6)%2:0;
  box(c,x-6,y-1,12,4,"#143b3c70");
  box(c,x-4,y-5,3,5+walk,"#2b484b");box(c,x+1,y-5,3,6-walk,"#2b484b");
  box(c,x-5,y-13,10,9,"#2f8580");box(c,x-4,y-13,2,8,"#70b6a0");
  box(c,x-7,y-11,2,7,"#d8aa7f");box(c,x+5,y-11,2,7,"#d8aa7f");
  box(c,x-4,y-19,8,7,"#b98662");box(c,x-5,y-22,10,5,"#e4d8ad");box(c,x-6,y-18,12,2,"#f3dfaa");
  if(s.facing==="up") {box(c,x-4,y-16,8,3,"#4a3f37");box(c,x-3,y-11,7,7,"#d3a44e");box(c,x-2,y-10,5,2,"#f0c36d");}
  else {box(c,x-2,y-16,1,2,"#343c37");box(c,x+2,y-16,1,2,"#343c37");box(c,s.facing==="left"?x+3:x-5,y-10,3,6,"#d3a44e");}
}
function drawObject(c,o,s,t) {
  const x=o.x,y=o.y;
  if(o.note) {
    if(s.notes.includes(o.id)) return;
    box(c,x-4,y-5,8,10,"#d5c997");box(c,x-2,y-3,4,1,"#667c66");box(c,x-2,y,4,1,"#667c66");
    if(Math.floor(t*2)%2) box(c,x+6,y-7,2,2,P.gold);
    return;
  }
  if(o.id==="lab") {box(c,x-8,y-4,16,6,"#587c65");box(c,x-5,y-6,10,5,s.gauge?P.gold:P.mint);return;}
  if(o.id==="relay") {
    if(!s.found) return;
    box(c,x-5,y-3,10,5,"#526d5c");box(c,x-1,y-21,3,20,"#cbceaa");
    box(c,x-10,y-19,8,5,"#204f60");box(c,x+3,y-19,8,5,"#204f60");box(c,x-5,y-25,11,4,s.relay?P.mint:P.gold);
    if(!s.relay) { c.strokeStyle="#edcc7d";c.strokeRect(x-13,y-29,26,34); }
  }
  if(o.id==="compare") {
    box(c,x-9,y-2,18,6,"#355950");box(c,x-6,y-15,12,14,"#b7c8ac");box(c,x-4,y-13,8,7,"#264f58");
    box(c,x-3,y-12,3,4,s.captures.includes("A")?P.mint:"#678f8b");box(c,x+1,y-12,3,4,s.captures.includes("B")?P.gold:"#678f8b");
    text(c,"A · B",x,y-20,"#f0ddae",6);
  }
  if(o.id==="gauge") {
    box(c,x-2,y-20,4,23,"#d8d6aa");
    for(let i=0;i<5;i++) box(c,x-2,y-17+i*4,3,1,"#526f67");
    box(c,x+3,y-(s.era==="B"?17:8),7,5,s.gauge?P.mint:P.gold);box(c,x-7,y+2,14,2,"#31594d");
  }
}
export function createGameRenderer(canvas, miniCanvas, reducedMotion=false) {
  const c=canvas.getContext("2d"), m=miniCanvas.getContext("2d"),cache=new Map();
  let camera={x:0,y:0}, width=384,height=240,narrow=false,aspect=1.6;
  const scene=(s)=>{ const key=`${s.era}-${bridgeOpen(s)}`;if(!cache.has(key))cache.set(key,terrain(s));return cache.get(key); };
  function resize(compact,ratio=1.6) {narrow=compact;aspect=Number.isFinite(ratio)&&ratio>0?ratio:1.6;width=narrow?240:384;height=Math.max(160,Math.min(320,Math.round(width/aspect)));canvas.width=width;canvas.height=height;c.imageSmoothingEnabled=false;}
  function draw(s,time) {
    const comparing=stageOf(s)==="compare",desired=narrow?(comparing?320:240):384;
    if(width!==desired) {width=desired;height=Math.max(160,Math.min(320,Math.round(width/aspect)));canvas.width=width;canvas.height=height;}
    camera.x=Math.round(Math.max(0,Math.min(COLS*TILE-width,s.x-width*(comparing?.18:.5))));
    camera.y=Math.round(Math.max(0,Math.min(ROWS*TILE-height,s.y-height/2)));
    c.imageSmoothingEnabled=false;c.clearRect(0,0,width,height);c.drawImage(scene(s),-camera.x,-camera.y);
    c.save();c.translate(-camera.x,-camera.y);
    // Fine moving water highlights, with a still equivalent for reduced motion.
    const phase=reducedMotion?0:Math.floor(time*3)%12;
    for(let y=0;y<ROWS;y++) for(const x of [18,19]) if(tileAt(x,y,s)==="water") box(c,x*16+2+(phase+y)%8,y*16+8,5,1,"#91bdae65");
    if(s.nav.length) {s.nav.forEach((p,i)=>{if(i%2===0)box(c,p.x-1,p.y-1,2,2,"#f7e4a1aa");});}
    const target=targetOf(s);
    if(stageOf(s)!=="complete") {
      const k=reducedMotion?0:Math.round(Math.sin(time*3)*2);
      box(c,target.x-3,target.y-36+k,6,3,P.gold);box(c,target.x-1,target.y-33+k,2,2,P.gold);
    }
    OBJECTS.filter((o)=>o.y<=s.y).forEach((o)=>drawObject(c,o,s,time));
    player(c,s);
    OBJECTS.filter((o)=>o.y>s.y).forEach((o)=>drawObject(c,o,s,time));
    const leader=s.nav[0];
    drawEcho(c,leader?s.x+Math.sign(leader.x-s.x)*18:s.x+17,leader?s.y+Math.sign(leader.y-s.y)*18-12:s.y-17,reducedMotion?0:time);
    // Cloud cover is decorative, never a barrier. A pulse temporarily reveals the ground beneath.
    c.save();c.globalAlpha=s.reveal>0?.13:.73;
    for(let i=0;i<7;i++) {
      const x=64+i*25+(reducedMotion?0:Math.sin(time*.15+i)*5),y=57+(i%3)*20;
      box(c,x-10,y,57,14,"#a8c0af");box(c,x-2,y-8,42,29,"#b8cbbb");box(c,x+7,y-14,23,37,"#c1d1bf");
    }
    c.restore();
    for(const p of s.pulses) {
      c.strokeStyle=`rgba(185,245,210,${Math.max(0,1-p.age)})`;c.lineWidth=1;
      c.beginPath();c.arc(p.x,p.y,12+p.age*135,0,Math.PI*2);c.stroke();
    }
    // Small fireflies and a pair of herons add life without affecting scientific readings.
    if(!reducedMotion) for(let i=0;i<9;i++) {const x=70+i*61,y=190+Math.sin(time*.45+i)*11+i%3*48;box(c,x,y,1,1,i%2?"#d7dba2":"#b5d9b0");}
    c.restore();
    // A restrained vignette is generated in the canvas, leaving a bright playable centre.
    const glow=c.createRadialGradient(width*.5,height*.45,width*.15,width*.5,height*.5,width*.75);
    glow.addColorStop(0,"#102f3200");glow.addColorStop(1,"#0c30383d");c.fillStyle=glow;c.fillRect(0,0,width,height);
    drawMini(s,scene(s));
  }
  function drawMini(s,bg) {
    m.imageSmoothingEnabled=false;m.clearRect(0,0,120,84);m.drawImage(bg,0,0,120,84);
    const sx=120/(COLS*TILE),sy=84/(ROWS*TILE),target=targetOf(s);
    box(m,target.x*sx-2,target.y*sy-2,4,4,P.gold);box(m,s.x*sx-2,s.y*sy-2,4,4,"#fff2c0");
    m.strokeStyle="#ecf6d980";m.lineWidth=1;m.strokeRect(camera.x*sx,camera.y*sy,width*sx,height*sy);
  }
  resize(false);
  return {draw,resize,worldPoint(clientX,clientY) {const rect=canvas.getBoundingClientRect();return {x:camera.x+(clientX-rect.left)/rect.width*width,y:camera.y+(clientY-rect.top)/rect.height*height};}};
}
