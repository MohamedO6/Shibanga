import test from "node:test";
import assert from "node:assert/strict";
import { readFile,stat } from "node:fs/promises";
import { newGame,checkpoint,stageOf,bridgeOpen,tileAt,canStand,move,pulse,switchEra,interact,targetOf,routeTo,tick,OBJECTS } from "../game-core.js";

function follow(s,target=targetOf(s)) {
  s.nav=routeTo(s,target);assert.ok(s.nav.length,"a collision-safe route exists");
  for(let i=0;i<4000 && s.nav.length;i++)tick(s,.05);
  assert.equal(s.nav.length,0,"navigation reaches the objective without teleporting");
  assert.ok(Math.hypot(s.x-target.x,s.y-target.y)<4);
}
test('actual archive pocket is separate from fictional mission completion',()=>{
 const s=newGame({version:1,archiveSeen:true,archivePair:{a:'2026-06-26',b:'2026-10-12'}});
 assert.equal(stageOf(s),'relay');assert.equal(s.gauge,false);assert.equal(s.delivered,false);assert.deepEqual(newGame(checkpoint(s)).archivePair,s.archivePair);
 assert.equal(newGame({version:1,archivePair:{a:'2026-02-30',b:'2026-10-12'}}).archivePair,null);
 assert.equal(newGame({version:1,archivePair:{a:'2026-10-12',b:'2026-06-26'}}).archivePair,null);
});
test("the expedition is playable end-to-end through its collision paths",()=>{
  const s=newGame();assert.equal(stageOf(s),"relay");
  follow(s);assert.equal(pulse(s).type,"discovery");assert.equal(interact(s).type,"milestone");
  assert.equal(stageOf(s),"compare");follow(s);
  interact(s);assert.equal(s.captures.length,1);assert.equal(bridgeOpen(s),false);
  switchEra(s);interact(s);assert.equal(bridgeOpen(s),true);assert.equal(stageOf(s),"gauge");
  follow(s);interact(s);assert.equal(stageOf(s),"return");
  follow(s);assert.equal(interact(s).type,"complete");assert.equal(stageOf(s),"complete");
});
test("a relay cannot be collected remotely or while hidden",()=>{
  const s=newGame();assert.equal(pulse(s).type,"pulse");assert.equal(s.found,false);
  s.x=168;s.y=120;assert.notEqual(interact(s).type,"milestone");
  s.cooldown=0;pulse(s);interact(s);assert.equal(s.relay,true);
});
test("same-date captures cannot power the bridge",()=>{
  const s=newGame({version:1,relay:true});follow(s);interact(s);interact(s);interact(s);
  assert.deepEqual(s.captures,["B"]);assert.equal(bridgeOpen(s),false);
  switchEra(s);interact(s);assert.equal(bridgeOpen(s),true);
});
test("a field check cannot bypass paired observations",()=>{
  const s=newGame();const g=OBJECTS.find((o)=>o.id==="gauge");s.x=g.x;s.y=g.y;
  assert.equal(interact(s).type,"hint");assert.equal(s.gauge,false);
});
test("delivering at the station requires all three evidence steps",()=>{
  const s=newGame();s.x=104;s.y=392;interact(s);assert.equal(s.delivered,false);
});
test("water and buildings block movement; bridges use quest state",()=>{
  const s=newGame();assert.equal(canStand(18*16+8,5*16+8,s),false);
  assert.equal(canStand(18*16+8,8*16+8,s),false);
  assert.equal(canStand(104,360,s),false);
  assert.equal(canStand(18*16+8,23*16+8,s),true);
  s.captures=["A","B"];assert.equal(canStand(18*16+8,8*16+8,s),true);
});
test("diagonal walking has the same speed and large time gaps cannot tunnel",()=>{
  const a=newGame(),b=newGame();move(a,1,0,.05);move(b,1,1,.05);
  assert.ok(Math.abs(Math.hypot(a.x-104,a.y-408)-Math.hypot(b.x-104,b.y-408))<1e-8);
  const s=newGame();s.x=17*16+8;s.y=5*16+8;
  for(let i=0;i<20;i++)move(s,1,0,100);
  assert.ok(s.x<18*16);assert.equal(canStand(s.x,s.y,s),true);
});
test("manual movement cancels navigation assistance",()=>{
  const s=newGame();s.nav=routeTo(s);tick(s,.05,{x:1,y:0});assert.deepEqual(s.nav,[]);
});
test("both survey states preserve walkable paths and standable positions",()=>{
  const s=newGame({version:1,relay:true});const before=tileAt(27,4,s);
  switchEra(s);assert.notEqual(tileAt(27,4,s),before);assert.equal(canStand(s.x,s.y,s),true);
});
test("checkpoint recovery rejects corrupt, partial and impossible progress",()=>{
  assert.equal(stageOf(newGame("broken")),"relay");
  assert.equal(stageOf(newGame({version:1,relay:false,captures:["A","B"],gauge:true,delivered:true})),"relay");
  const s=newGame({version:1,relay:true,captures:["A","A","x"],gauge:true,delivered:true,x:-400,y:Infinity,notes:["bad"]});
  assert.equal(stageOf(s),"compare");assert.deepEqual(s.captures,["A"]);assert.equal(s.x,104);assert.deepEqual(s.notes,[]);
});
test("checkpoints retain progress without transient inputs or a moving route",()=>{
  const s=newGame({version:1,relay:true,captures:["A","B"],gauge:true});s.nav=routeTo(s);
  const restored=newGame(checkpoint(s));assert.equal(stageOf(restored),"return");assert.deepEqual(restored.nav,[]);assert.equal(restored.cooldown,0);
});
test("optional field notes are discoverable once and remain optional for completion",()=>{
  const s=newGame();const n=OBJECTS.find((o)=>o.note);s.x=n.x;s.y=n.y;
  assert.equal(interact(s).fresh,true);assert.equal(interact(s).fresh,undefined);assert.equal(s.notes.length,1);
  assert.equal(stageOf(s),"relay");
});
test("a short radar cooldown throttles pulses without locking the expedition",()=>{
  const s=newGame();pulse(s);assert.equal(pulse(s).type,"quiet");
  for(let i=0;i<24;i++)tick(s,.05);assert.equal(pulse(s).type,"pulse");
});
test("the game stays English-only and explicitly separates fictional readings",async()=>{
  const code=await readFile(new URL("../game.js",import.meta.url),"utf8");
  assert.equal(/\p{Script=Arabic}/u.test(code),false);
  assert.match(code,/FICTIONAL TRAINING WORLD/);assert.match(code,/No game reading is exported as a real measurement/);
  const image=await stat(new URL("../assets/game/delta-dispatch.webp",import.meta.url));assert.ok(image.size<700000);
});
